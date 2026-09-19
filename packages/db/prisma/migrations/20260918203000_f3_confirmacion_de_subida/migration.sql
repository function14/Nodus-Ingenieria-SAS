-- Confirmacion server-side de la subida: la version solo cuenta cuando el
-- objeto existe en el bucket y su sha256 real coincide con el declarado.
ALTER TABLE "DocumentVersion" ADD COLUMN "confirmedAt" TIMESTAMP(3);

-- Las versiones ya existentes se dan por confirmadas para no romper datos
-- previos; a partir de aqui toda subida nueva pasa por la verificacion.
UPDATE "DocumentVersion" SET "confirmedAt" = "uploadedAt" WHERE "confirmedAt" IS NULL;
