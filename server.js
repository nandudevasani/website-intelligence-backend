import express from "express";
import cors from "cors";
import axios from "axios";
import { JSDOM } from "jsdom";

const app = express();
app.use(cors());
app.use(express.json());

// ----- Helper Functions -----

function extractSocialLinks(html) {
  const facebook = (html.match(/https?:\/\/(www\.)?facebook\.com\/[^\s"'<>]+/gi) || [])[0] || "";
  const instagram = (html.match(/https?:\/\/(www\.)?instagram\.com\/[^\s"'<>]+/gi) || [])[0] || "";
  const linkedin = (html.match(/https?:\/\/(www\.)?linkedin\.com\/[^\s"'<>]+/gi) || [])[0] || "";
  const gmb = (html.match(/https?:\/\/(g\.page|www\.google\.com\/maps\/place)\/[^\s"'<>]+/gi) || [])[0] || "";
  return { facebook, instagram, linkedin, gmb };
}

function extractPhone(html) {
  const phones = html.match(/\+?\d[\d\-\(\) ]{7,}\d/g);
  return phones ? phones[0] : "";
}

function extractEmail(html) {
  const emails = html.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-z]{2,}/gi);
  return emails ? emails[0] : "";
}

function extractBusinessInfo(html) {
  let name = "";
  let street = "";
  let city = "";
  let state = "";
  let zip = "";

  // 1️⃣ JSON-LD Organization
  const jsonLdMatch = html.match(/<script type=["']application\/ld\+json["']>([\s\S]*?)<\/script>/gi);
  if (jsonLdMatch) {
    for (let script of jsonLdMatch) {
      try {
        const data = JSON.parse(script.replace(/<script.*?>|<\/script>/gi, ""));
        if (data["@type"] === "Organization") {
          name = data.name || "";
          if (data.address) {
            street = data.address.streetAddress || "";
            city = data.address.addressLocality || "";
            state = data.address.addressRegion || "";
            zip = data.address.postalCode || "";
          }
        }
      } catch (e) { continue; }
    }
  }

  // 2️⃣ <address> tags fallback
  try {
    const dom = new JSDOM(html);
    const addrTag = dom.window.document.querySelector("address");
    if (addrTag) {
      const lines = addrTag.textContent.split("\n").map(l => l.trim()).filter(Boolean);
      if (lines.length >= 3) {
        street = street || lines[0];
        const cityStateZip = lines[1].split(",");
        city = city || cityStateZip[0]?.trim();
        const stateZip = cityStateZip[1]?.trim().split(" ");
        state = state || stateZip?.[0] || "";
        zip = zip || stateZip?.[1] || "";
      }
      name = name || dom.window.document.querySelector("title")?.textContent || "";
    }
  } catch (e) { }

  return { name, street, city, state, zip };
}

// ----- Bulk Analyze Endpoint -----
app.post("/bulk-analyze", async (req, res) => {
  const { domains } = req.body;
  if (!domains || !Array.isArray(domains))
    return res.status(400).json({ error: "Domains array required" });

  const results = [];

  for (let domain of domains) {
    try {
      const response = await axios.get(`https://${domain}`, {
        timeout: 10000,
        validateStatus: () => true,
        headers: { "User-Agent": "Mozilla/5.0" }
      });

      const html = response.data.toLowerCase();
      let status = response.status >= 200 && response.status < 400 ? "Active" : "Inactive";
      let reason = "";

      if (status === "Inactive") reason = "Server or DNS error";
      if (html.includes("coming soon") || html.includes("under construction")) reason = "Coming Soon";
      if (html.includes("redirect") || response.request.res.responseUrl !== `https://${domain}/`) reason = "Redirected";

      const social = extractSocialLinks(response.data);
      const phone = extractPhone(response.data);
      const email = extractEmail(response.data);
      const business = extractBusinessInfo(response.data);

      results.push({
        domain,
        status,
        statusCode: response.status,
        reason,
        phone,
        email,
        social,
        ...business
      });

    } catch (error) {
      results.push({
        domain,
        status: "Inactive",
        statusCode: 0,
        reason: "Unreachable / DNS Error or Blocked",
        phone: "",
        email: "",
        social: { facebook: "", instagram: "", linkedin: "", gmb: "" },
        name: "",
        street: "",
        city: "",
        state: "",
        zip: ""
      });
    }
  }

  res.json(results);
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log("Server running on port " + PORT));
