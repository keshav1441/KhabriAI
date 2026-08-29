-- Findings become translatable: the detectors stop storing an English
-- sentence and start storing the values behind it, so lib/alertText.ts can
-- build the sentence in Kannada at read time. `title`/`detail` stay as the
-- English rendering and as the fallback for rows written before this.
ALTER TABLE "Alert" ADD COLUMN "params" JSONB;
