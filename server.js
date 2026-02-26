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
  var result = {
    name: "",
    street: "",
    city: "",
    state: "",
    zip: "",
    phone: "",
    email: "",
    social: { facebook: "", instagram: "", linkedin: "", gmb: "" }
  };

  if (!html || typeof html !== "string") return result;

  try {
    // === DOM-BASED EXTRACTION ===
    var dom = new JSDOM(html, { url: baseUrl });
    var doc = dom.window.document;

    // Business name
    var el = doc.querySelector("meta[property='og:site_name']");
    if (el && el.content) result.name = el.content.trim();
    if (!result.name) {
      el = doc.querySelector("meta[name='application-name']");
      if (el && el.content) result.name = el.content.trim();
    }
    if (!result.name) {
      el = doc.querySelector("title");
      if (el && el.textContent) result.name = el.textContent.trim();
    }

    // Schema.org address
    el = doc.querySelector("[itemprop='streetAddress']");
    if (el) result.street = el.textContent.trim();
    el = doc.querySelector("[itemprop='addressLocality']");
    if (el) result.city = el.textContent.trim();
    el = doc.querySelector("[itemprop='addressRegion']");
    if (el) result.state = el.textContent.trim();
    el = doc.querySelector("[itemprop='postalCode']");
    if (el) result.zip = el.textContent.trim();

    // Phone from DOM
    el = doc.querySelector("[itemprop='telephone']");
    if (el) result.phone = el.textContent.trim();
    if (!result.phone) {
      el = doc.querySelector("a[href^='tel:']");
      if (el) {
        result.phone = el.href.replace("tel:", "").trim();
      }
    }

    // Email from DOM
    el = doc.querySelector("a[href^='mailto:']");
    if (el && el.href) {
      result.email = el.href.replace("mailto:", "").split("?")[0].trim();
    }

    // Social from DOM links
    var allLinks = doc.querySelectorAll("a[href]");
    for (var i = 0; i < allLinks.length; i++) {
      var href = allLinks[i].href || "";
      if (!result.social.facebook && href.indexOf("facebook.com") !== -1 && href.indexOf("sharer") === -1) {
        result.social.facebook = href;
      }
      if (!result.social.instagram && href.indexOf("instagram.com") !== -1) {
        result.social.instagram = href;
      }
      if (!result.social.linkedin && href.indexOf("linkedin.com") !== -1 && href.indexOf("share") === -1) {
        result.social.linkedin = href;
      }
      if (!result.social.gmb && (href.indexOf("google.com/maps") !== -1 || href.indexOf("maps.google") !== -1 || href.indexOf("goo.gl/maps") !== -1)) {
        result.social.gmb = href;
      }
    }
  } catch (e) {
    // DOM parsing failed, continue with regex
  }

  // === REGEX-BASED EXTRACTION (catches what DOM misses) ===

  // Social links from raw HTML (catches JS-rendered href strings too)
  if (!result.social.facebook) {
    var fbMatch = html.match(/https?:\/\/(www\.)?facebook\.com\/[a-zA-Z0-9._-]+/i);
    if (fbMatch) result.social.facebook = fbMatch[0];
  }
  if (!result.social.instagram) {
    var igMatch = html.match(/https?:\/\/(www\.)?instagram\.com\/[a-zA-Z0-9._-]+/i);
    if (igMatch) result.social.instagram = igMatch[0];
  }
  if (!result.social.linkedin) {
    var liMatch = html.match(/https?:\/\/(www\.)?linkedin\.com\/(company|in)\/[a-zA-Z0-9._-]+/i);
    if (liMatch) result.social.linkedin = liMatch[0];
  }
  if (!result.social.gmb) {
    var gmbMatch = html.match(/https?:\/\/(www\.)?(google\.com\/maps|maps\.google\.com|goo\.gl\/maps)[^\s"'<>]*/i);
    if (gmbMatch) result.social.gmb = gmbMatch[0];
  }

  // Twitter/X
  var twMatch = html.match(/https?:\/\/(www\.)?(twitter\.com|x\.com)\/[a-zA-Z0-9._-]+/i);

  // YouTube
  var ytMatch = html.match(/https?:\/\/(www\.)?youtube\.com\/(channel|c|@)[^\s"'<>]*/i);

  // Email from raw HTML
  if (!result.email) {
    var emailMatch = html.match(/mailto:([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/i);
    if (emailMatch) result.email = emailMatch[1];
  }
  if (!result.email) {
    var emailMatch2 = html.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.(com|org|net|io|co|biz|info|edu)/i);
    if (emailMatch2 && emailMatch2[0].indexOf("example") === -1 && emailMatch2[0].indexOf("sentry") === -1 && emailMatch2[0].indexOf("webpack") === -1) {
      result.email = emailMatch2[0];
    }
  }

  // Phone from raw HTML
  if (!result.phone) {
    var phoneMatch = html.match(/tel:([+]?[\d\s()-]{7,})/i);
    if (phoneMatch) result.phone = phoneMatch[1].trim();
  }
  if (!result.phone) {
    // Look for phone patterns in visible text areas
    var phoneRegex = /(?:phone|tel|call|contact)[^<]{0,50}([+]?[(]?\d{1,4}[)]?[-\s.]?\d{1,4}[-\s.]?\d{1,9})/i;
    var phoneMatch2 = html.match(phoneRegex);
    if (phoneMatch2) result.phone = phoneMatch2[1].trim();
  }

  // Clean up name - remove pipes and dashes trailing parts
  if (result.name) {
    var parts = result.name.split(/\s*[|–—-]\s*/);
    if (parts.length > 1 && parts[0].length > 2) {
      result.name = parts[0].trim();
    }
  }

  return result;
}

app.post("/bulk-analyze", async function (req, res) {
  try {
    var domains = req.body.domains;

    if (!domains || !Array.isArray(domains) || domains.length === 0) {
      return res.status(400).json({ error: "Domains array required" });
    }

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
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.5"
          }
        });

        var code = response.status;
        var status = "Active";
        var reason = "";

        // Status logic — anything under 400 is Active
        if (code >= 200 && code < 400) {
          status = "Active";
        } else {
          status = "Inactive";
          reason = "HTTP " + code;
        }

        var htmlStr = typeof response.data === "string" ? response.data : "";
        var htmlLower = htmlStr.toLowerCase();

        // Check for parked/coming soon pages
        if (htmlLower.indexOf("coming soon") !== -1 && htmlStr.length < 50000) {
          reason = "Coming Soon";
        }
        if (htmlLower.indexOf("under construction") !== -1 && htmlStr.length < 50000) {
          reason = "Under Construction";
        }
        if (htmlLower.indexOf("parked domain") !== -1 || htmlLower.indexOf("this domain is for sale") !== -1) {
          status = "Inactive";
          reason = "Parked Domain";
        }

        var info = extractInfo(htmlStr, url);

        console.log("[OK] " + domain + " -> " + status + " (" + code + ") name=" + info.name.substring(0, 30) + " fb=" + (info.social.facebook ? "Y" : "N") + " ig=" + (info.social.instagram ? "Y" : "N"));

        results.push({
          domain: domain,
          status: status,
          statusCode: code,
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
        else if (err.code === "ERR_TLS_CERT_ALTNAME_INVALID" || err.code === "CERT_HAS_EXPIRED") errReason = "SSL Error";
        else if (err.message) errReason = err.message.substring(0, 60);

        console.log("[FAIL] " + domain + " -> " + errReason);

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
    res.status(500).json({ error: "Server error" });
  }
});

var PORT = process.env.PORT || 3000;
app.listen(PORT, function () {
  console.log("Server running on port " + PORT);
});
