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
