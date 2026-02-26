import express from "express";
import cors from "cors";
import axios from "axios";

const app = express();
app.use(cors());
app.use(express.json());

function extractSocialLinks(html) {
  const facebook = (html.match(/https?:\/\/(www\.)?facebook\.com\/[^\s"'<>]+/gi) || [])[0] || "";
  const instagram = (html.match(/https?:\/\/(www\.)?instagram\.com\/[^\s"'<>]+/gi) || [])[0] || "";
  const linkedin = (html.match(/https?:\/\/(www\.)?linkedin\.com\/[^\s"'<>]+/gi) || [])[0] || "";
  const gmb = (html.match(/https?:\/\/(g\.page|www\.google\.com\/maps\/place)\/[^\s"'<>]+/gi) || [])[0] || "";
  return { facebook, instagram, linkedin, gmb };
}

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

      let status = response.status >= 200 && response.status < 400 ? "Active" : "Inactive";
      let reason = "";
      const html = response.data.toLowerCase();

      if (status === "Inactive") reason = "Server or DNS error";
      if (html.includes("coming soon") || html.includes("under construction")) reason = "Coming Soon";
      if (html.includes("redirect") || response.request.res.responseUrl !== `https://${domain}/`) reason = "Redirected";

      const social = extractSocialLinks(response.data);

      results.push({
        domain,
        status,
        statusCode: response.status,
        reason,
        phone: "", // optional: you can add regex to detect phone
        email: "", // optional: detect email regex
        social
      });

    } catch (error) {
      results.push({
        domain,
        status: "Inactive",
        statusCode: 0,
        reason: "Unreachable / DNS Error or Blocked",
        phone: "",
        email: "",
        social: { facebook: "", instagram: "", linkedin: "", gmb: "" }
      });
    }
  }

  res.json(results);
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log("Server running on port " + PORT));
