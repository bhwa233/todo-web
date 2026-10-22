-- CreateTable
CREATE TABLE "TrackMeta" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "remark" TEXT NOT NULL DEFAULT '',
    "createTime" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updateTime" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" DATETIME
);

-- CreateTable
CREATE TABLE "TrackItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "remark" TEXT NOT NULL,
    "createTime" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updateTime" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "countMetaId" TEXT,
    "deletedAt" DATETIME,
    CONSTRAINT "TrackItem_countMetaId_fkey" FOREIGN KEY ("countMetaId") REFERENCES "TrackMeta" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Task" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "remark" TEXT NOT NULL,
    "createTime" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updateTime" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" DATETIME,
    "status" TEXT NOT NULL,
    "priority" TEXT DEFAULT 'NOT_IMPORTANT_NOT_URGENT'
);

-- CreateTable
CREATE TABLE "Bookmark" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "url" TEXT NOT NULL,
    "remark" TEXT,
    "createTime" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updateTime" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" DATETIME,
    "image" TEXT,
    "summary" TEXT,
    "title" TEXT,
    "loading" BOOLEAN NOT NULL DEFAULT true
);

-- CreateTable
CREATE TABLE "BookmarkTag" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "remark" TEXT,
    "createTime" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updateTime" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" DATETIME
);

-- CreateTable
CREATE TABLE "Anniversary" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "remark" TEXT NOT NULL,
    "createTime" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updateTime" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" DATETIME,
    "date" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Media" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "width" INTEGER,
    "height" INTEGER,
    "postId" TEXT,
    "originSrc" TEXT,
    "userId" TEXT,
    "createTime" DATETIME DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" DATETIME,
    "updateTime" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "galleryMediaUrl" TEXT,
    "originMediaUrl" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "producerId" TEXT,
    "thumbnailUrl" TEXT,
    CONSTRAINT "Media_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Media_producerId_fkey" FOREIGN KEY ("producerId") REFERENCES "producer" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "producer" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "createTime" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updateTime" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" DATETIME,
    "name" TEXT,
    "producerId" TEXT,
    "type" TEXT NOT NULL DEFAULT 'WEIBO_PERSONAL',
    "lastPostTime" DATETIME
);

-- CreateTable
CREATE TABLE "ProducerTag" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "remark" TEXT,
    "createTime" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updateTime" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" DATETIME
);

-- CreateTable
CREATE TABLE "TaskTag" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "remark" TEXT,
    "createTime" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updateTime" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" DATETIME
);

-- CreateTable
CREATE TABLE "Post" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "producerId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "platformId" TEXT NOT NULL,
    "createTime" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updateTime" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    CONSTRAINT "Post_producerId_fkey" FOREIGN KEY ("producerId") REFERENCES "producer" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "_ProducerToProducerTag" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    PRIMARY KEY ("A", "B"),
    CONSTRAINT "_ProducerToProducerTag_A_fkey" FOREIGN KEY ("A") REFERENCES "producer" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "_ProducerToProducerTag_B_fkey" FOREIGN KEY ("B") REFERENCES "ProducerTag" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Asset" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "amount" REAL NOT NULL,
    "date" DATETIME NOT NULL,
    "description" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "_TaskToTaskTag" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,
    CONSTRAINT "_TaskToTaskTag_A_fkey" FOREIGN KEY ("A") REFERENCES "Task" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "_TaskToTaskTag_B_fkey" FOREIGN KEY ("B") REFERENCES "TaskTag" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "_BookmarkToBookmarkTag" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,
    CONSTRAINT "_BookmarkToBookmarkTag_A_fkey" FOREIGN KEY ("A") REFERENCES "Bookmark" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "_BookmarkToBookmarkTag_B_fkey" FOREIGN KEY ("B") REFERENCES "BookmarkTag" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Bookmark_url_key" ON "Bookmark"("url");

-- CreateIndex
CREATE INDEX "Media_userId_idx" ON "Media"("userId");

-- CreateIndex
CREATE INDEX "Media_createTime_idx" ON "Media"("createTime");

-- CreateIndex
CREATE INDEX "Media_postId_idx" ON "Media"("postId");

-- CreateIndex
CREATE INDEX "Media_producerId_idx" ON "Media"("producerId");

-- CreateIndex
CREATE INDEX "Media_status_createTime_idx" ON "Media"("status", "createTime");

-- CreateIndex
CREATE INDEX "producer_type_createTime_idx" ON "producer"("type", "createTime");

-- CreateIndex
CREATE UNIQUE INDEX "ProducerTag_name_key" ON "ProducerTag"("name");

-- CreateIndex
CREATE UNIQUE INDEX "TaskTag_name_key" ON "TaskTag"("name");

-- CreateIndex
CREATE INDEX "Post_userId_idx" ON "Post"("userId");

-- CreateIndex
CREATE INDEX "Post_createTime_idx" ON "Post"("createTime");

-- CreateIndex
CREATE INDEX "Post_status_createTime_idx" ON "Post"("status", "createTime");

-- CreateIndex
CREATE INDEX "Post_producerId_createTime_idx" ON "Post"("producerId", "createTime");

-- CreateIndex
CREATE UNIQUE INDEX "Post_platform_platformId_key" ON "Post"("platform", "platformId");

-- CreateIndex
CREATE INDEX "_ProducerToProducerTag_B_index" ON "_ProducerToProducerTag"("B");

-- CreateIndex
CREATE UNIQUE INDEX "_TaskToTaskTag_AB_unique" ON "_TaskToTaskTag"("A", "B");

-- CreateIndex
CREATE INDEX "_TaskToTaskTag_B_index" ON "_TaskToTaskTag"("B");

-- CreateIndex
CREATE UNIQUE INDEX "_BookmarkToBookmarkTag_AB_unique" ON "_BookmarkToBookmarkTag"("A", "B");

-- CreateIndex
CREATE INDEX "_BookmarkToBookmarkTag_B_index" ON "_BookmarkToBookmarkTag"("B");


-- An internal precondition failure aborts the entire D1 batch.
CREATE TABLE "_MutationGuard" ("ok" INTEGER NOT NULL, CONSTRAINT "_mutation_guard" CHECK ("ok" = 1));
