-- CreateTable
CREATE TABLE "Container" (
    "id" TEXT NOT NULL,
    "containerNumber" TEXT NOT NULL,
    "masterBillNumber" TEXT,
    "scacCode" TEXT,
    "steamshipLine" TEXT,
    "vesselName" TEXT,
    "voyageNumber" TEXT,
    "containerSize" TEXT,
    "containerType" TEXT,
    "equipmentType" TEXT,
    "originName" TEXT,
    "portName" TEXT,
    "terminalName" TEXT,
    "trackingStatus" TEXT,
    "lastFreeDay" TIMESTAMP(3),
    "detentionLastFreeDay" TIMESTAMP(3),
    "dischargedAt" TIMESTAMP(3),
    "outgatedAt" TIMESTAMP(3),
    "emptyReturnedAt" TIMESTAMP(3),
    "etaAtTerminal" TIMESTAMP(3),
    "etdFromOrigin" TIMESTAMP(3),
    "hasAvailableEvent" BOOLEAN NOT NULL DEFAULT false,
    "history" JSONB,
    "lastSeenAt" TIMESTAMP(3),
    "missingFromFeed" BOOLEAN NOT NULL DEFAULT false,
    "destination" TEXT,
    "carrier" TEXT,
    "appointmentAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "notes" TEXT,
    "driverName" TEXT,
    "truckNumber" TEXT,
    "receivingContact" TEXT,
    "contactPhone" TEXT,
    "deliveryAddress" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Container_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SyncRun" (
    "id" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "success" BOOLEAN NOT NULL,
    "source" TEXT NOT NULL,
    "message" TEXT,
    "containersSeen" INTEGER NOT NULL DEFAULT 0,
    "emailSent" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "SyncRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Container_containerNumber_key" ON "Container"("containerNumber");

-- CreateIndex
CREATE INDEX "Container_masterBillNumber_idx" ON "Container"("masterBillNumber");

-- CreateIndex
CREATE INDEX "Container_missingFromFeed_idx" ON "Container"("missingFromFeed");

-- CreateIndex
CREATE INDEX "SyncRun_startedAt_idx" ON "SyncRun"("startedAt");
