import express from "express";
import cors from "cors";
import axios from "axios";
import { JSDOM } from "jsdom";

const app = express();
app.use(cors());
app.use(express.json());

// Extract business info & social links
function extractInfo(html) {
  const dom = new JSDOM(html);
  const doc = dom.window.document;

  const name = doc.querySelector("meta[property='og:site_name']")?.content || "";
  const street = doc.querySelector("[itemprop='streetAddress']")?.textContent || "";
  const city = doc.querySelector("[itemprop='addressLocality']")?.textContent || "";
  const state = doc.querySelector("[itemprop='addressRegion']")?.textContent || "";
  const zip = doc.querySelector("[itemprop='postalCode']")?.textContent || "";
  const phone = doc.querySelector("[itemprop='telephone']")?.textContent || "";
  const email = doc.querySelector("a[href^='mailto:']")?.textContent || "";

  const links = Array.from(doc.querySelectorAll("a[href]")).map(a => a.href);
  const social = {
    facebook: links.find(l => l.includes("facebook.com")) || "",
    instagram: links.find(l => l.includes("instagram.com")) || "",
    linkedin: links.find(l => l.includes("linkedin.com")) || "",
    gmb: links.find(l => l.includes("google.com/maps")) || ""
  };

  return { name, street, city, state, zip, phone, email, social };
}

// Bulk analyze endpoint
app.post("/bulk-analyze", async (req, res) => {
  const { domains } = req.body;
  if (!domains || !Array.isArray(domains)) {
    return res.status(400).json({ error: "Domains array required" });
  }

  const results = [];

  for (let domain of domains) {
    try {
      const response = await axios.get(`https://${domain}`, {
        timeout: 8000,
        validateStatus: () => true,
        headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" }
      });

      let status = "Active";
      let reason = "";

      if (response.status >= 400) {
        status = "Inactive";
        reason = "Server Error";
      }

      const html = response.data.toLowerCase();
      if (html.includes("coming soon") || html.includes("under construction")) {
        reason = "Coming Soon";
      }

      const info = extractInfo(response.data);

      results.push({
        domain,
        status,
        statusCode: response.status,
        reason,
        ...info
      });

    } catch {
      results.push({
        domain,
        status: "Inactive",
        statusCode: 0,
        reason: "Unreachable / DNS Error or Blocked",
        name: "",
        street: "",
        city: "",
        state: "",
        zip: "",
        phone: "",
        email: "",
        social: { facebook: "", instagram: "", linkedin: "", gmb: "" }
      });
    }
  }

  res.json(results);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("Server running on port " + PORT));
