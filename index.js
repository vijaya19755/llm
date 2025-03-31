const express = require("express");
const multer = require("multer");
const fs = require("fs");
const path = require("path");
const csvParser = require("csv-parser");
const fetch = require("node-fetch"); // Importing node-fetch for making HTTP requests
const dotenv = require("dotenv");

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

// Google Gemini API key
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_API_URL =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=GEMINI_API_KEY";

// Set up multer for file uploads
const upload = multer({ dest: "uploads/" });

// API Endpoint
app.post("/api", upload.single("file"), async (req, res) => {
  try {
    const { question } = req.body;
    const file = req.file;

    if (!question) {
      return res.status(400).json({ error: "Question is required." });
    }

    let answer;

    if (file) {
      const filePath = path.join(__dirname, "uploads", file.filename);

      if (file.mimetype === "application/zip") {
        // Unzip and process CSV
        const csvFilePath = await extractCSV(filePath);
        answer = await extractCSVAnswer(csvFilePath);
      } else {
        return res.status(400).json({ error: "Only ZIP files are supported." });
      }
    } else {
      // Get answer from Google Gemini
      answer = await getGeminiAnswer(question);
    }

    res.json({ answer });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Something went wrong." });
  }
});

// Function to get answer from Google Gemini
async function getGeminiAnswer(question) {
  const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`;

  try {
    const response = await fetch(GEMINI_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              {
                text: question,
              },
            ],
          },
        ],
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error("Error response from Gemini API:", errorData);
      throw new Error("Failed to fetch response from Gemini API");
    }

    const data = await response.json();
    return data?.choices?.[0]?.message?.content || "No answer found.";
  } catch (error) {
    console.error("Error during API call:", error.message);
    throw error;
  }
}

// Function to extract CSV from ZIP
async function extractCSV(zipPath) {
  return new Promise((resolve, reject) => {
    fs.createReadStream(zipPath)
      .pipe(unzipper.Parse())
      .on("entry", (entry) => {
        if (entry.path.endsWith(".csv")) {
          const csvPath = `uploads/${entry.path}`;
          entry
            .pipe(fs.createWriteStream(csvPath))
            .on("finish", () => resolve(csvPath));
        } else {
          entry.autodrain();
        }
      })
      .on("error", reject);
  });
}

// Function to extract answer from CSV
async function extractCSVAnswer(csvPath) {
  return new Promise((resolve, reject) => {
    const results = [];
    fs.createReadStream(csvPath)
      .pipe(csvParser())
      .on("data", (data) => results.push(data))
      .on("end", () => resolve(results[0]?.answer || "No answer found."))
      .on("error", reject);
  });
}

// Start Server
app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});
