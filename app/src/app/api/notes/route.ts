import { NextResponse } from "next/server";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { getDataDir, getSocialNotesPath } from "@/lib/data-path";
import type { SocialNote } from "@/lib/types";

const NOTES_FILE = getSocialNotesPath();

async function readNotes(): Promise<SocialNote[]> {
  try {
    const content = await readFile(NOTES_FILE, "utf8");
    const notes = JSON.parse(content) as SocialNote[];
    return Array.isArray(notes) ? notes : [];
  } catch {
    return [];
  }
}

async function saveNotes(notes: SocialNote[]) {
  await mkdir(getDataDir(), { recursive: true });
  await writeFile(NOTES_FILE, JSON.stringify(notes, null, 2), "utf8");
}

export async function GET(request: Request) {
  const symbol = new URL(request.url).searchParams.get("symbol");
  const notes = await readNotes();
  if (!symbol) {
    return NextResponse.json(notes);
  }

  const note = notes.find((item) => item.symbol === symbol);
  return NextResponse.json(note ?? null);
}

export async function POST(request: Request) {
  const body = (await request.json()) as { symbol?: string; note?: string };
  const symbol = body.symbol?.trim().toUpperCase();
  const note = body.note?.trim();

  if (!symbol || !note) {
    return NextResponse.json({ error: "symbol and note are required" }, { status: 400 });
  }

  const notes = await readNotes();
  const next: SocialNote = { symbol, note, updatedAt: new Date().toISOString() };
  const index = notes.findIndex((item) => item.symbol === symbol);
  if (index >= 0) {
    notes[index] = next;
  } else {
    notes.push(next);
  }
  await saveNotes(notes);

  return NextResponse.json(next, { status: 201 });
}
