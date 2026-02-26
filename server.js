import express from "express";
import axios from "axios";
import cors from "cors";
import dns from "dns/promises";

const app = express();
app.use(cors());
app.use(express.json());

function detectCMS(html) {
  const lower = html.toLowerCase();
  if (lower.includes("wp-content")) return "WordPress";
  if (lower.includes("shopify")) return "Shopify";
  if (lower.includes("wix.com")) return "Wix";
  if (lower.includes("squarespace")) return "Squarespace";
  if (lower.includes("joomla")) return "Joomla";
  return "Unknown";
}

function detectMobile(html) {
  return html.includes("viewport");
}

function detectEmail(html) {
  return /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(html);
}

function detectPhone(html) {
  return /\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/.test(html);
}

function classifyBusiness(html) {
  const lower = html.toLowerCase();
  if (lower.includes("restaurant")) return "Restaurant";
  if (lower.includes("law firm")) return "Legal";
  if (lower.includes("clinic")) return "Healthcare";
  if (lower.includes("shop") || lower.includes("cart")) return "E-commerce";
  if (lower.includes("consulting")) return "Consulting";
  return "General Business";
}

app.post("/analyze", async (req, res) => {
  const { domain } = req.body;

  try {
    const response = await axios.get(`https://${domain}`, {
      timeout: 10000,
      validateStatus: () => true
    });

    const html = response.data;
    const headers = response.headers;
    const ipInfo = await dns.lookup(domain);

    res.json({
      verified: true,
      domain,
      statusCode: response.status,
      server: headers.server || "Unknown",
      ip: ipInfo.address,
      cms: detectCMS(html),
      mobileResponsive: detectMobile(html),
      emailFound: detectEmail(html),
      phoneFound: detectPhone(html),
      businessType: classifyBusiness(html)
    });

  } catch (error) {
    res.json({
      verified: false,
      domain,
      error: "Website unreachable or blocked"
    });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("Server running on port " + PORT);
});
