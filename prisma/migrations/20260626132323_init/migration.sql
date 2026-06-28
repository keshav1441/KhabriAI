-- CreateTable
CREATE TABLE "Station" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "district" TEXT NOT NULL,
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "Station_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Incident" (
    "id" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "district" TEXT NOT NULL,
    "station" TEXT NOT NULL,
    "ipcSection" TEXT NOT NULL,
    "crimeType" TEXT NOT NULL,
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,
    "status" TEXT NOT NULL,
    "stationId" TEXT NOT NULL,

    CONSTRAINT "Incident_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Person" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "ageBand" TEXT NOT NULL,
    "gender" TEXT NOT NULL,

    CONSTRAINT "Person_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PersonIncident" (
    "personId" TEXT NOT NULL,
    "incidentId" TEXT NOT NULL,

    CONSTRAINT "PersonIncident_pkey" PRIMARY KEY ("personId","incidentId")
);

-- CreateTable
CREATE TABLE "CaseLink" (
    "id" TEXT NOT NULL,
    "incidentAId" TEXT NOT NULL,
    "incidentBId" TEXT NOT NULL,
    "linkType" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "CaseLink_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Incident_district_idx" ON "Incident"("district");

-- CreateIndex
CREATE INDEX "Incident_crimeType_idx" ON "Incident"("crimeType");

-- CreateIndex
CREATE INDEX "Incident_date_idx" ON "Incident"("date");

-- CreateIndex
CREATE INDEX "Incident_status_idx" ON "Incident"("status");

-- CreateIndex
CREATE INDEX "CaseLink_incidentAId_idx" ON "CaseLink"("incidentAId");

-- CreateIndex
CREATE INDEX "CaseLink_incidentBId_idx" ON "CaseLink"("incidentBId");

-- AddForeignKey
ALTER TABLE "Incident" ADD CONSTRAINT "Incident_stationId_fkey" FOREIGN KEY ("stationId") REFERENCES "Station"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PersonIncident" ADD CONSTRAINT "PersonIncident_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PersonIncident" ADD CONSTRAINT "PersonIncident_incidentId_fkey" FOREIGN KEY ("incidentId") REFERENCES "Incident"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CaseLink" ADD CONSTRAINT "CaseLink_incidentAId_fkey" FOREIGN KEY ("incidentAId") REFERENCES "Incident"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CaseLink" ADD CONSTRAINT "CaseLink_incidentBId_fkey" FOREIGN KEY ("incidentBId") REFERENCES "Incident"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
