"use client";

import React from "react";
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Copy, Share2, Trash2, FileText, Image as ImageIcon, File as FileIcon } from "lucide-react";
import { formatDate, formatFileSize } from "@/lib/format";

export type ClipboardItem = {
  id: string;
  type: "TEXT" | "IMAGE" | "FILE";
  content?: string;
  fileName?: string;
  fileSize?: number;
  sortWeight?: number;
  createdAt: string;
  updatedAt: string;
};

type GridProps = {
  items: ClipboardItem[];
  onReorder: (items: ClipboardItem[]) => void;
  onSelectItem: (id: string) => void;
  onCopy: (content: string) => void;
  onRequestDelete: (id: string) => void;
  onRequestShare: (id: string) => void;
};

function getTypeIcon(type: string) {
  switch (type) {
    case "TEXT":
      return <FileText className="h-4 w-4" />;
    case "IMAGE":
      return <ImageIcon className="h-4 w-4" />;
    case "FILE":
    default:
      return <FileIcon className="h-4 w-4" />;
  }
}

export default function ClipboardGrid({ items, onReorder, onSelectItem, onCopy, onRequestDelete, onRequestShare }: GridProps) {
  const sensors = useSensors(
    // 使用移动距离阈值，避免按压延迟带来的点击迟滞感
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  function handleDragEnd(event: any) {
    const { active, over } = event;
    if (!over) return;
    if (active.id !== over.id) {
      const oldIndex = items.findIndex((i) => i.id === active.id);
      const newIndex = items.findIndex((i) => i.id === over.id);
      if (oldIndex >= 0 && newIndex >= 0) {
        onReorder(arrayMove(items, oldIndex, newIndex));
      }
    }
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={items.map((i) => i.id)}>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {items.map((item) => (
            <SortableItem
              key={item.id}
              id={item.id}
              item={item}
              onSelectItem={onSelectItem}
              onCopy={onCopy}
              onRequestDelete={onRequestDelete}
              onRequestShare={onRequestShare}
            />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}

type SortableItemProps = {
  id: string;
  item: ClipboardItem;
  onSelectItem: (id: string) => void;
  onCopy: (content: string) => void;
  onRequestDelete: (id: string) => void;
  onRequestShare: (id: string) => void;
};

const SortableItem = React.memo(function SortableItem({ id, item, onSelectItem, onCopy, onRequestDelete, onRequestShare }: SortableItemProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  } as React.CSSProperties;

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <Card
        className="group relative hover:shadow-md transition-shadow cursor-pointer h-52"
        onClick={() => {
          if (!isDragging) onSelectItem(item.id);
        }}
      >
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {getTypeIcon(item.type)}
              <Badge variant="secondary">{item.type}</Badge>
            </div>
            <div className="flex gap-1 items-center opacity-0 group-hover:opacity-100 transition-opacity">
              <Button
                size="sm"
                variant="ghost"
                className="cursor-pointer"
                onClick={(e) => {
                  e.stopPropagation();
                  if (item.content) onCopy(item.content);
                }}
                disabled={!item.content}
              >
                <Copy className="h-3 w-3" />
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="cursor-pointer"
                onClick={(e) => {
                  e.stopPropagation();
                  onRequestShare(item.id);
                }}
                aria-label="分享"
                title="分享"
              >
                <Share2 className="h-3 w-3" />
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="cursor-pointer"
                onClick={(e) => {
                  e.stopPropagation();
                  onRequestDelete(item.id);
                }}
                aria-label="删除"
                title="删除"
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pb-12">
          <div className="space-y-2">
            {(item.type === "FILE" || item.type === "IMAGE") && (
              <p className="text-sm font-medium truncate">{item.fileName || (item.type === "IMAGE" ? "图片" : "文件")}</p>
            )}
            {item.content && <p className="text-sm text-muted-foreground line-clamp-3">{item.content}</p>}
          </div>
          <div className="absolute bottom-3 right-3 text-right text-xs text-muted-foreground">
            {typeof item.fileSize === "number" && item.fileSize > 0 && <div>大小: {formatFileSize(item.fileSize)}</div>}
            <div>{formatDate(item.createdAt)}</div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
});
