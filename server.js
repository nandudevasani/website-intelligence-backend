import express from "express";
import cors from "cors";
import axios from "axios";
import { JSDOM } from "jsdom";

var app = express();
app.use(cors());
app.use(express.json());

app.get("/", function (req, res) {
  res.json({ status: "ok" });
});

function extractInfo(html, baseUrl) {
  try {
    var dom = new JSDOM(html, { url: baseUrl });
    var doc = dom.window.document;

    var name = "";
    var el = doc.querySelector("meta[property='og:site_name']");
    if (el && el.content) name = el.content;
    if (!name) {
      el = doc.querySelector("title");
      if (el) name = el.textContent || "";
    }

    var street = "";
    el = doc.querySelector("[itemprop='streetAddress']");
    if (el) street = el.textContent || "";

    var city = "";
    el = doc.querySelector("[itemprop='addressLocality']");
    if (el) city = el.textContent || "";

    var state = "";
    el = doc.querySelector("[itemprop='addressRegion']");
    if (el) state = el.textContent || "";

    var zip = "";
    el = doc.querySelector("[itemprop='postalCode']");
    if (el) zip = el.textContent || "";

    var phone = "";
    el = doc.querySelector("[itemprop='telephone']");
    if (el) phone = el.textContent || "";
    if (!phone) {
      el = doc.querySelector("a[href^='tel:']");
      if (el) phone = el.textContent || "";
    }

    var email = "";
    el = doc.querySelector("a[href^='mailto:']");
    if (el && el.href) email = el.href.replace("mailto:", "");

    var allLinks = doc.querySelectorAll("a[href]");
    var links = [];
    for (var i = 0; i < allLinks.length; i++) {
      links.push(allLinks[i].href);
    }

    var facebook = "";
    var instagram = "";
    var linkedin = "";
    var gmb = "";

    for (var j = 0; j < links.length; j++) {
      var l = links[j];
      if (!facebook && l.indexOf("facebook.com") !== -1) facebook = l;
      if (!instagram && l.indexOf("instagram.com") !== -1) instagram = l;
      if (!linkedin && l.indexOf("linkedin.com") !== -1) linkedin = l;
      if (!gmb && (l.indexOf("google.com/maps") !== -1 || l.indexOf("maps.google.com") !== -1)) gmb = l;
    }

    return {
      name: name.trim(),
      street: street.trim(),
      city: city.trim(),
      state: state.trim(),
      zip: zip.trim(),
      phone: phone.trim(),
      email: email.trim(),
      social: { facebook: facebook, instagram: instagram, linkedin: linkedin, gmb: gmb }
    };
  } catch (e) {
    return {
      name: "", street: "", city: "", state: "", zip: "", phone: "", email: "",
      social: { facebook: "", instagram: "", linkedin: "", gmb: "" }
    };
  }
}

app.post("/bulk-analyze", async function (req, res) {
  try {
    var domains = req.body.domains;

    if (!domains || !Array.isArray(domains) || domains.length === 0) {
      return res.status(400).json({ error: "Domains array required" });
    }

    // Limit to 5 per request to stay within Render 30s timeout
    if (domains.length > 5) {
      domains = domains.slice(0, 5);
    }

    var results = [];

    for (var i = 0; i < domains.length; i++) {
      var domain = domains[i].replace(/^https?:\/\//, "").replace(/\/+$/, "").trim();
      if (!domain) continue;

      try {
        var url = "https://" + domain;
        var response = await axios.get(url, {
          timeout: 6000,
          maxRedirects: 5,
          validateStatus: function () { return true; },
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
          }
        });

        var status = "Active";
        var reason = "";

        if (response.status >= 400) {
          status = "Inactive";
          reason = "HTTP " + response.status;
        }

        var htmlStr = typeof response.data === "string" ? response.data : "";
        var htmlLower = htmlStr.toLowerCase();

        if (htmlLower.indexOf("coming soon") !== -1 || htmlLower.indexOf("under construction") !== -1) {
          reason = "Coming Soon";
        }
        if (htmlLower.indexOf("parked domain") !== -1 || htmlLower.indexOf("this domain is for sale") !== -1) {
          reason = "Parked Domain";
        }

        var info = htmlStr ? extractInfo(htmlStr, url) : {
          name: "", street: "", city: "", state: "", zip: "", phone: "", email: "",
          social: { facebook: "", instagram: "", linkedin: "", gmb: "" }
        };

        results.push({
          domain: domain,
          status: status,
          statusCode: response.status,
          reason: reason,
          name: info.name,
          street: info.street,
          city: info.city,
          state: info.state,
          zip: info.zip,
          phone: info.phone,
          email: info.email,
          social: info.social
        });

      } catch (err) {
        var errReason = "Unknown Error";
        if (err.code === "ENOTFOUND") errReason = "DNS Not Found";
        else if (err.code === "ECONNREFUSED") errReason = "Connection Refused";
        else if (err.code === "ETIMEDOUT" || err.code === "ECONNABORTED") errReason = "Timed Out";
        else if (err.code === "CERT_HAS_EXPIRED") errReason = "SSL Error";
        else if (err.message) errReason = err.message.substring(0, 50);

        results.push({
          domain: domain,
          status: "Inactive",
          statusCode: 0,
          reason: errReason,
          name: "", street: "", city: "", state: "", zip: "", phone: "", email: "",
          social: { facebook: "", instagram: "", linkedin: "", gmb: "" }
        });
      }
    }

    res.json(results);

  } catch (err) {
    console.error("Server error:", err);
    res.status(500).json({ error: "Server error: " + err.message });
  }
});

var PORT = process.env.PORT || 3000;
app.listen(PORT, function () {
  console.log("Server running on port " + PORT);
});
