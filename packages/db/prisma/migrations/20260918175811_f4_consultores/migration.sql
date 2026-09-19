-- AlterTable
ALTER TABLE "Case" ADD COLUMN     "areaCode" TEXT,
ADD COLUMN     "complexityLevel" TEXT;

-- CreateTable
CREATE TABLE "Consultant" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "humanId" TEXT NOT NULL,
    "specialtyCodes" TEXT[],
    "levelCode" TEXT,
    "availability" TEXT NOT NULL DEFAULT 'disponible',
    "status" TEXT NOT NULL DEFAULT 'registrado',
    "enabledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Consultant_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Consultant_userId_key" ON "Consultant"("userId");

-- CreateIndex
CREATE INDEX "Consultant_tenantId_status_idx" ON "Consultant"("tenantId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Consultant_tenantId_humanId_key" ON "Consultant"("tenantId", "humanId");

-- AddForeignKey
ALTER TABLE "Consultant" ADD CONSTRAINT "Consultant_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Consultant" ADD CONSTRAINT "Consultant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
