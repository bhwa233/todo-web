-- Derived index only: legacy Media columns and IDs remain unchanged.
CREATE TABLE "_MediaRandom" (
  mediaId INTEGER PRIMARY KEY NOT NULL REFERENCES Media(id) ON DELETE CASCADE,
  slot INTEGER NOT NULL
);
CREATE INDEX "_MediaRandom_order" ON "_MediaRandom"(slot,mediaId);
INSERT INTO "_MediaRandom" (mediaId,slot) SELECT id,(random() & 2147483647) FROM Media;
CREATE TRIGGER "_MediaRandom_insert" AFTER INSERT ON Media BEGIN
  INSERT INTO "_MediaRandom" (mediaId,slot) VALUES (new.id,(random() & 2147483647));
END;
