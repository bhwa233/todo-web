-- CreateTable
CREATE TABLE "CustomCommand" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ownerKeyHash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "command" TEXT NOT NULL,
    "description" TEXT,
    "replyType" TEXT NOT NULL,
    "contentText" TEXT,
    "imageUrl" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createTime" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updateTime" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewComment" TEXT,
    "reviewedAt" DATETIME,
    "reviewerKeyHash" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "submittedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "CustomCommand_command_key" ON "CustomCommand"("command");

-- CreateIndex
CREATE INDEX "CustomCommand_status_enabled_sortOrder_idx" ON "CustomCommand"("status", "enabled", "sortOrder");

-- CreateIndex
CREATE INDEX "CustomCommand_ownerKeyHash_status_idx" ON "CustomCommand"("ownerKeyHash", "status");
