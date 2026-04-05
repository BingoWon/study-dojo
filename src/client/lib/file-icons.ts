import type { FC } from "react";
import {
	IconFileTypeBmp,
	IconFileTypeDoc,
	IconFileTypeDocx,
	IconFileTypeJpg,
	IconFileTypePdf,
	IconFileTypePng,
	IconFileTypeTxt,
} from "@tabler/icons-react";
import { FileText } from "lucide-react";

export const FILE_ICONS: Record<string, FC<{ className?: string }>> = {
	pdf: IconFileTypePdf,
	png: IconFileTypePng,
	jpg: IconFileTypeJpg,
	jpeg: IconFileTypeJpg,
	bmp: IconFileTypeBmp,
	doc: IconFileTypeDoc,
	docx: IconFileTypeDocx,
	txt: IconFileTypeTxt,
	md: IconFileTypeTxt,
	markdown: IconFileTypeTxt,
};

export function getFileIcon(ext?: string | null): FC<{ className?: string }> {
	return FILE_ICONS[ext ?? ""] ?? FileText;
}
