import express from "express";
import dotenv from "dotenv";
import {
  dbInitialise,
  dbClose,
  dbSaveLink,
  dbDeleteLink,
  dbUpdateFilenameForId,
  dbGetRecords,
} from "./db.js";
import fs from "fs";
import { pipeline } from "stream/promises";
import fetch from "node-fetch";

dotenv.config();

const app = express();
const port = 3000;

// two minute trigger for image collection
const updateTime = 3 * 60 * 1000;
// stop downloading this much time before the next update
const downloadTime = 1 * 60 * 1000;

const API_KEY = process.env.API_KEY;
const URL = process.env.URL;

dbInitialise();

// Middleware
app.set("view engine", "ejs");
app.use(express.static("public"));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

async function markAsComplete(id, hash) {
  const markCompleteResponse = await fetch(`${URL}/api/mark-complete`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ id: id, hash: hash, apiKey: API_KEY }),
  });
  if (!markCompleteResponse.ok) {
    console.log(
      `Failed to mark image as downloaded at remote: ${markCompleteResponse.statusText}`
    );
  }
  console.log(`Marked image ${id} as downloaded.`);
}

async function markAsFailed(id, hash) {
  const markFailedResponse = await fetch(`${URL}/api/mark-failed`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ id: id, hash: hash, apiKey: API_KEY }),
  });
  if (!markFailedResponse.ok) {
    console.log(
      `Failed to mark image as failed at remote: ${markCompleteResponse.statusText}`
    );
  }
  console.log(`Marked image ${id} as failed.`);
}

async function downloadImage(id, url, datetime, hash) {
  console.log(`Downloading ${url}`);
  try {
    // Save the metadata to the local database
    const newRecord = await dbSaveLink(url, datetime);
    const fileExtension = url.split(".").pop();
    const filename = `public/images/${newRecord.lastID}.${fileExtension}`;
    // Fetch the image
    const imageResponse = await fetch(url);
    if (!imageResponse.ok) {
      dbDeleteLink(newRecord.lastID);
      await markAsFailed(id, hash);
      console.log(`Failed to fetch image: ${imageResponse.statusText}`);
      return;
    }
    // Validate content type
    const contentType = imageResponse.headers.get("content-type");
    if (!contentType?.startsWith("image/")) {
      dbDeleteLink(newRecord.lastID);
      await markAsFailed(id, hash);
      console.log(`Invalid content type: ${contentType} for url: ${url}`);
      return;
    }
    try {
      // Stream the image to the file
      await pipeline(imageResponse.body, fs.createWriteStream(filename));
      // update the local record with the filename
      await dbUpdateFilenameForId(newRecord.lastID, filename);
      // Mark the image as downloaded at the remote
      await markAsComplete(id, hash);
    } catch (error) {
      // Clean up partial file if there's an error
      try {
        await fs.promises.unlink(filename);
      } catch (unlinkError) {
        console.error(`Failed to delete partial file: ${filename}`);
      }
      throw error;
    }
  } catch (error) {
    await markAsFailed(id, hash);
    console.error("Error downloading or saving image:", url);
  }
}

async function collectImages() {
  // we want to stop before the next update cycle
  const stopTime = Date.now() + updateTime - downloadTime;

  const response = await fetch(`${URL}/api/new-records`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ apiKey: API_KEY }),
  });

  if (response.ok) {
    const data = await response.json();
    if (data.length === 0) {
      console.log("No new images");
      return;
    }
    console.log(`Found ${data.length} new images`);
    for (const record of data) {
      if (Date.now() < stopTime) {
        await downloadImage(
          record.id,
          record.url,
          record.datetime,
          record.hash
        );
      } else {
        console.log("Stopping (time)");
        break;
      }
    }
    console.log("Stopping (done)");
  } else {
    console.log("response not ok");
    console.log(await response.text());
  }
}

// Routes
app.get("/", async (req, res) => {
  try {
    const imageRecords = await dbGetRecords();
    imageRecords.filter((record) => {
      return record.filename;
    });
    res.render("index", { imageRecords });
  } catch (error) {
    console.error("Error fetching records:", error);
    res.status(500).send("Internal Server Error");
  }
});

// collect links on an interval
setInterval(collectImages, updateTime);

// Graceful shutdown
process.on("SIGINT", async () => {
  console.log("Shutdown initiated");
  try {
    await dbClose();
    // Close any open connections
    if (app && app.server) {
      await new Promise((resolve, reject) => {
        app.server.close((err) => {
          if (err) reject(err);
          else resolve();
        });
      });
    }
    console.log("Shutdown complete");
  } catch (err) {
    console.error("Error during shutdown:", err);
  } finally {
    process.exit(0);
  }
});

// Start the server
app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});
