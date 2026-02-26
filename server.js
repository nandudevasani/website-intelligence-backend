// server.js
import express from "express";
import axios from "axios";
import cors from "cors";

const app = express();
app.use(cors());
app.use(express.json());

// Extract social links + Google Business Profile
function extractSocialLinks(html) {
  const socials = { facebook: false, instagram: false, linkedin: false, gmb: false };
  if (html.includes("facebook.com")) socials.facebook = true;
  if (html.includes("instagram.com")) socials.instagram = true;
  if (html.includes("linkedin.com")) socials.linkedin = true;
  if (html.includes("google.com/maps")) socials.gmb = true; // GMB detection
  return socials;
}

// Check content type
function checkContent(html) {
  const lowered = html.toLowerCase();
  if (lowered.includes("coming soon") || lowered.includes("under construction")) return "Coming Soon";
  if (lowered.trim() === "") return "Blank / No Content";
  if (lowered.includes("redirect")) return "Redirected";
  return "";
}

// Extract business info
function extractBusinessInfo(html) {
  const info = { name: "", street: "", city: "", state: "", zip: "", phone: "", email: "" };

  // Name from title
  const titleMatch = html.match(/<title>(.*?)<\/title>/i);
  if (titleMatch) info.name = titleMatch[1].trim();

  // Email
  const emailMatch = html.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-z]{2,}/gi);
  if (emailMatch) info.email = emailMatch[0];

  // Phone (US)
  const phoneMatch = html.match(/(\+?1[-.\s]?)?(\(\d{3}\)|\d{3})[-.\s]?\d{3}[-.\s]?\d{4}/);
  if (phoneMatch) info.phone = phoneMatch[0];

  // Address: street, city, state, zip (simple regex)
  const addrMatch = html.match(/(\d{1,5}\s[\w\s.]+),\s*([\w\s]+),\s*([A-Z]{2})\s*(\d{5})/);
  if (addrMatch) {
    info.street = addrMatch[1];
    info.city = addrMatch[2];
    info.state = addrMatch[3];
    info.zip = addrMatch[4];
  }

  return info;
}

app.post("/bulk-analyze", async (req, res) => {
  const { domains } = req.body;
  if (!domains || !Array.isArray(domains))
    return res.status(400).json({ error: "Domains array required" });

  const results = [];

  for (let domain of domains) {
    try {
      const response = await axios.get(`https://${domain}`, {
        timeout: 8000,
        validateStatus: () => true,
        headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" }
      });

      const html = response.data || "";
      const reason = checkContent(html);
      const socials = extractSocialLinks(html);
      const business = extractBusinessInfo(html);

      results.push({
        domain,
        status: response.status >= 200 && response.status < 400 ? "Active" : "Inactive",
        statusCode: response.status,
        reason,
        ...business,
        social: socials
      });

    } catch (error) {
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
        social: { facebook: false, instagram: false, linkedin: false, gmb: false }
      });
    }
  }

  res.json(results);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("Server running on port " + PORT));
