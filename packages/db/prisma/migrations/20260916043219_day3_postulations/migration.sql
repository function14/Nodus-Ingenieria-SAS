-- CreateTable
CREATE TABLE "Postulation" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "consultorId" TEXT NOT NULL,
    "note" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDIENTE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Postulation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Postulation_tenantId_idx" ON "Postulation"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "Postulation_caseId_consultorId_key" ON "Postulation"("caseId", "consultorId");

-- AddForeignKey
ALTER TABLE "Postulation" ADD CONSTRAINT "Postulation_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Postulation" ADD CONSTRAINT "Postulation_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Postulation" ADD CONSTRAINT "Postulation_consultorId_fkey" FOREIGN KEY ("consultorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
