import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";

export async function GET(
	_req: Request,
	{ params }: { params: Promise<{ id: string }> },
) {
	const { userId } = await auth();
	if (!userId) return NextResponse.json({ error: "未授权" }, { status: 401 });
	const { id } = await params;

	const supabase = createServerClient();
	const { data: link } = await supabase
		.from("user_papers")
		.select("title")
		.eq("user_id", userId)
		.eq("paper_id", id)
		.maybeSingle();
	if (!link) return NextResponse.json({ error: "未找到" }, { status: 404 });

	const { data: paper } = await supabase
		.from("papers")
		.select("hash, file_ext")
		.eq("id", id)
		.maybeSingle();
	if (!paper) return NextResponse.json({ error: "未找到" }, { status: 404 });

	// Match storage path pattern from rag.ts ingestFile
	const ext = paper.file_ext ?? "pdf";
	const category = ext === "docx" ? "docx" : ["png", "jpg", "jpeg", "webp", "bmp", "tiff"].includes(ext) ? "img" : "pdf";
	const storagePath = `papers/${paper.hash}.${category}`;

	const { data } = await supabase.storage.from("papers").download(storagePath);
	if (!data) return NextResponse.json({ error: "文件不存在" }, { status: 404 });

	const filename = encodeURIComponent(link.title);
	return new Response(data, {
		headers: {
			"Content-Type": "application/octet-stream",
			"Content-Disposition": `attachment; filename="${filename}.${ext}"`,
		},
	});
}
