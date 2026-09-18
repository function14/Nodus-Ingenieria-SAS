-- AlterTable
ALTER TABLE "Notification" ADD COLUMN     "channel" TEXT NOT NULL DEFAULT 'in_app',
ADD COLUMN     "deliveryStatus" TEXT NOT NULL DEFAULT 'pending',
ADD COLUMN     "recipientRole" TEXT,
ADD COLUMN     "sentAt" TIMESTAMP(3),
ADD COLUMN     "templateCode" TEXT;

-- AlterTable
ALTER TABLE "Template" ADD COLUMN     "kind" TEXT NOT NULL DEFAULT 'form';

-- AlterTable
ALTER TABLE "TemplateVersion" ADD COLUMN     "body" TEXT,
ADD COLUMN     "subject" TEXT,
ADD COLUMN     "variables" JSONB NOT NULL DEFAULT '[]';

-- CreateTable
CREATE TABLE "CommunicationRule" (
    "id" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "templateCode" TEXT NOT NULL,
    "recipientRole" TEXT,
    "channel" TEXT NOT NULL DEFAULT 'in_app',
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "CommunicationRule_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CommunicationRule_eventType_templateCode_recipientRole_key" ON "CommunicationRule"("eventType", "templateCode", "recipientRole");

-- F1 (wave 2): variables de la comunicacion, permiten re-renderizar la plantilla
-- POR LECTOR y aplicar el masking (un aviso de difusion es una sola fila que
-- distintos roles deben ver distinta).
-- (Fusionada aqui: una migracion previa nombrada como "fix" se elimino porque su
-- sello horario la hacia aplicar ANTES de esta, pero dependia de sus columnas.)
ALTER TABLE "Notification" ADD COLUMN "vars" JSONB;

CREATE INDEX "Notification_tenantId_recipientRole_userId_idx"
  ON "Notification"("tenantId", "recipientRole", "userId");
CREATE INDEX "Notification_tenantId_channel_deliveryStatus_idx"
  ON "Notification"("tenantId", "channel", "deliveryStatus");
