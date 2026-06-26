import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import ChatApp from "./ChatApp";

export default async function ChatPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  return <ChatApp username={session.username} />;
}
