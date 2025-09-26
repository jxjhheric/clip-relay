"use client";

import React from "react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  Copy,
  Share2,
  Trash2,
  FileText,
  Image as ImageIcon,
  File as FileIcon,
} from "lucide-react";
import { formatDate, formatFileSize } from "@/lib/format";
import type { ClipboardItem as GridItem } from "@/components/clipboard/ClipboardGrid";

export type ClipboardItem = GridItem;

type ListProps = {
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

export default function ClipboardList({
  items,
  onReorder,
  onSelectItem,
  onCopy,
  onRequestDelete,
  onRequestShare,
}: ListProps) {
  const sensors = useSensors(
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
      <SortableContext items={items.map((i) => i.id)} strategy={verticalListSortingStrategy}>
        <div className="rounded-md border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[50%] min-w-[280px]">条目</TableHead>
                <TableHead className="w-[15%]">大小</TableHead>
                <TableHead className="w-[25%]">创建时间</TableHead>
                <TableHead className="w-[10%] text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item) => (
                <SortableRow
                  key={item.id}
                  id={item.id}
                  item={item}
                  onSelectItem={onSelectItem}
                  onCopy={onCopy}
                  onRequestDelete={onRequestDelete}
                  onRequestShare={onRequestShare}
                />
              ))}
            </TableBody>
          </Table>
        </div>
      </SortableContext>
    </DndContext>
  );
}

type RowProps = {
  id: string;
  item: ClipboardItem;
  onSelectItem: (id: string) => void;
  onCopy: (content: string) => void;
  onRequestDelete: (id: string) => void;
  onRequestShare: (id: string) => void;
};

const SortableRow = React.memo(function SortableRow({
  id,
  item,
  onSelectItem,
  onCopy,
  onRequestDelete,
  onRequestShare,
}: RowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
  } as React.CSSProperties;

  const primaryText = (() => {
    if (item.type === "FILE" || item.type === "IMAGE") {
      return item.fileName || (item.type === "IMAGE" ? "图片" : "文件");
    }
    if (item.content) {
      const firstLine = item.content.split("\n")[0];
      return firstLine.trim() || "文本";
    }
    return "条目";
  })();
  const isText = item.type === "TEXT";

  return (
    <tr
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className="hover:bg-muted/50 border-b transition-colors cursor-pointer"
      onClick={() => {
        if (!isDragging) onSelectItem(item.id);
      }}
    >
      <TableCell>
        <div className="flex items-center gap-3">
          {getTypeIcon(item.type)}
          <div className="flex flex-col min-w-0">
            <div className="flex items-center gap-2 min-w-0">
              <span className={"truncate max-w-full " + (isText ? "text-sm" : "font-medium")}>{primaryText}</span>
              <Badge variant="secondary">{item.type}</Badge>
            </div>
            {!isText && item.content && (
              <p className="text-xs text-muted-foreground truncate max-w-full min-w-0 mt-1 break-all">
                {item.content}
              </p>
            )}
          </div>
        </div>
      </TableCell>
      <TableCell>
        {typeof item.fileSize === "number" && item.fileSize > 0
          ? formatFileSize(item.fileSize)
          : "-"}
      </TableCell>
      <TableCell>{formatDate(item.createdAt)}</TableCell>
      <TableCell className="text-right">
        <div className="flex justify-end gap-1">
          <Button
            size="sm"
            variant="ghost"
            className="cursor-pointer"
            onClick={(e) => {
              e.stopPropagation();
              if (item.content) onCopy(item.content);
            }}
            disabled={!item.content}
            aria-label="复制"
            title="复制"
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
      </TableCell>
    </tr>
  );
});
