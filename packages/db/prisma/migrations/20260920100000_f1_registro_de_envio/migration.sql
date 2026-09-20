-- RT-013: la comunicacion enviada se registra con su destinatario y asunto.
-- Permite ademas comprobar el canal email desde la propia aplicacion, sin
-- depender de acceder a un buzon externo.
ALTER TABLE "Notification" ADD COLUMN "recipientEmail" TEXT;
ALTER TABLE "Notification" ADD COLUMN "subject" TEXT;
