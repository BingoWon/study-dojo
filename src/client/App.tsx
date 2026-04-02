import { Chat } from "./Chat";

function App() {
	return (
		<main className="h-screen w-screen bg-[#09090b] text-zinc-100 overflow-hidden font-sans selection:bg-blue-500/30">
			<div className="h-full">
				<Chat />
			</div>
		</main>
	);
}

export default App;
