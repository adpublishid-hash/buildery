-- Adds a sandboxed custom HTML block for imported HTML/CSS/JavaScript.
ALTER TYPE "BlockType" ADD VALUE IF NOT EXISTS 'CUSTOM_HTML' AFTER 'TEXT';
