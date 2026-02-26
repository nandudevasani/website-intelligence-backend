// server.js
import express from "express";
import cors from "cors";
import axios from "axios";
import whois from "whois-json";

const app = express();
app.use(cors());
app.use(express.json());

// Helper function to extract info from HTML
function extractInfo(html) {
  const phoneMatch = html.match(/\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/);
  const emailMatch = html.match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/);

  const social = {
    facebook: html.includes("facebook.com"),
    instagram: html.includes("instagram.com"),
    linkedin: html.includes("linkedin.com"),
  };

  let reason = "";
  if (html.includes("coming soon") || html.includes("under construction")) {
    reason = "Coming Soon / Under Construction";
  } else if (html.includes("redirect")) {
    reason = "Redirected";
  } else if (html.replace(/\s/g, "").length < 50) {
    reason = "No Content / Empty Page";
  }

  return {
    phone: phoneMatch ? phoneMatch[0] : "",
    email: emailMatch ? emailMatch[0] : "",
    social,
    reason
  };
}

// Bulk analyze route
app.post("/bulk-analyze", async (req, res) => {
  const { domains } = req.body;

  if (!domains || !Array.isArray(domains)) {
    return res.status(400).json({ error: "Domains array required" });
  }

  const results = [];

  for (const domain of domains) {
    try {
      let status = "Active";
      let reason = "";
      let phone = "";
      let email = "";
      let social = { facebook: false, instagram: false, linkedin: false };
      let statusCode = 0;
      let domainAge = "Unknown";

      try {
        const response = await axios.get(`https://${domain}`, {
          timeout: 10000,
          validateStatus: () => true,
          headers: { "User-Agent": "Mozilla/5.0" },
        });

        statusCode = response.status;

        if (response.status >= 400) {
          status = "Inactive";
          reason = "Server Error";
        } else {
          const html = response.data.toLowerCase();
          const info = extractInfo(html);
          phone = info.phone;
          email = info.email;
          social = info.social;
          if (info.reason) reason = info.reason;
        }

      } catch (err) {
        status = "Inactive";
        reason = "Unreachable / DNS Error or Blocked";
      }

      // WHOIS lookup for domain age
      try {
        const whoisData = await whois(domain);
        domainAge = whoisData.creationDate || "Unknown";
      } catch (err) {
        domainAge = "Unknown";
      }

      results.push({
        domain,
        status,
        statusCode,
        reason,
        phone,
        email,
        social,
        domainAge
      });

    } catch (err) {
      results.push({
        domain,
        status: "Unverified",
        reason: "Manual check required",
        phone: "",
        email: "",
        social: { facebook: false, instagram: false, linkedin: false },
        domainAge: "Unknown"
      });
    }
  }

  return res.json(results);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("Server running on port " + PORT);
});
