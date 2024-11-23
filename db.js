import sqlite3 from "sqlite3";
import { open } from "sqlite";

let db;

async function dbInitialise() {
  db = await open({
    filename: "data/meme_images.db",
    driver: sqlite3.Database,
  });

  // Create table if needed
  await db.run(`CREATE TABLE IF NOT EXISTS images (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    url TEXT NOT NULL,
    datetime TEXT NOT NULL,
    filename TEXT)`);

  // Create indexes
  await db.run(`CREATE INDEX IF NOT EXISTS idx_datetime ON images (datetime)`);
}

async function dbClose() {
  if (db) {
    await db.close();
    console.log("Database connection closed.");
  }
}

async function dbSaveLink(url, datetime) {
  return await db.run(
    "INSERT INTO images (url, datetime) VALUES (?, ?)",
    [url, datetime]
  );
}

async function dbGetRecords() {
  return await db.all("SELECT id, url, datetime FROM images");
}

async function dbGetRecordById(id) {
  return await db.get("SELECT * FROM images WHERE id = ?", id);
}

async function dbDeleteLink(id) {
  return await db.run("DELETE FROM images WHERE id = ?", id);
}

async function dbUpdateFilenameForId(id, filename) {
  return await db.run("UPDATE images SET filename = ? WHERE id = ?", [
    filename,
    id,
  ]);
}

export {
  dbInitialise,
  dbClose,
  dbSaveLink,
  dbGetRecords,
  dbDeleteLink,
  dbGetRecordById,
  dbUpdateFilenameForId,
};
