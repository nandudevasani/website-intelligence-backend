import express from "express";
import cors from "cors";
import axios from "axios";
import { JSDOM } from "jsdom";

const app = express();
app.use(cors());
app.use(express.json());

// Health check route — helps verify the server is alive
app.get("/", (req, res) => {
  res.json({ status: "ok", message: "Website Intelligence Scanner API is running" });
});

// Extract business info & social links
function extractInfo(html, baseUrl) {
  const dom = new JSDOM(html, { url: baseUrl }); // FIX: Set base URL so a.href resolves correctly
  const doc = dom.window.document;

  const name =
    doc.querySelector("meta[property='og:site_name']")?.content ||
    doc.querySelector("title")?.textContent || // Fallback to <title>
    "";

  const street = doc.querySelector("[itemprop='streetAddress']")?.textContent || "";
  const city = doc.querySelector("[itemprop='addressLocality']")?.textContent || "";
  const state = doc.querySelector("[itemprop='addressRegion']")?.textContent || "";
  const zip = doc.querySelector("[itemprop='postalCode']")?.textContent || "";
  const phone = doc.querySelector("[itemprop='telephone']")?.textContent ||
    doc.querySelector("a[href^='tel:']")?.textContent || ""; // Fallback to tel: links
  const email = doc.querySelector("a[href^='mailto:']")?.href?.replace("mailto:", "") || "";

  const links = Array.from(doc.querySelectorAll("a[href]")).map(a => a.href);

  const social = {
    facebook: links.find(l => l.includes("facebook.com")) || "",
    instagram: links.find(l => l.includes("instagram.com")) || "",
    linkedin: links.find(l => l.includes("linkedin.com")) || "",
    gmb: links.find(l => l.includes("google.com/maps") || l.includes("maps.google.com")) || ""
  };

  return { name: name.trim(), street: street.trim(), city: city.trim(), state: state.trim(), zip: zip.trim(), phone: phone.trim(), email: email.trim(), social };
}

// Bulk analyze endpoint
app.post("/bulk-analyze", async (req, res) => {
  const { domains } = req.body;

  if (!domains || !Array.isArray(domains) || domains.length === 0) {
    return res.status(400).json({ error: "Domains array required" });
  }

  // Limit to 20 domains per request to avoid Render timeout
  const limitedDomains = domains.slice(0, 20);

  const results = [];

  for (let domain of limitedDomains) {
    // Clean domain input
    domain = domain.replace(/^https?:\/\//, "").replace(/\/+$/, "").trim();
    if (!domain) continue;

    try {
      const url = `https://${domain}`;
      const response = await axios.get(url, {
        timeout: 10000,
        maxRedirects: 5,
        validateStatus: () => true,
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        }
      });

      let status = "Active";
      let reason = "";

      if (response.status >= 400) {
        status = "Inactive";
        reason = `HTTP ${response.status}`;
      }

      const htmlLower = typeof response.data === "string" ? response.data.toLowerCase() : "";

      if (htmlLower.includes("coming soon") || htmlLower.includes("under construction")) {
        reason = "Coming Soon";
      }
      if (htmlLower.includes("parked domain") || htmlLower.includes("this domain is for sale")) {
        reason = "Parked Domain";
      }

      const info = typeof response.data === "string"
        ? extractInfo(response.data, url)
        : { name: "", street: "", city: "", state: "", zip: "", phone: "", email: "", social: { facebook: "", instagram: "", linkedin: "", gmb: "" } };

      results.push({
        domain,
        status,
        statusCode: response.status,
        reason,
        ...info
      });
    } catch (err) {
      results.push({
        domain,
        status: "Inactive",
        statusCode: 0,
        reason: err.code === "ENOTFOUND" ? "DNS Not Found" :
               err.code === "ECONNREFUSED" ? "Connection Refused" :
               err.code === "ETIMEDOUT" ? "Timed Out" :
               err.code === "CERT_HAS_EXPIRED" ? "SSL Certificate Expired" :
               `Error: ${err.code || err.message || "Unknown"}`,
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
