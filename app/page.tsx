import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import WordBook from "./WordBook";
import { ACCESS_COOKIE, getAccessCode, verifySessionToken } from "./lib/access";

export default async function Home() {
  const secret = getAccessCode();
  const cookieStore = await cookies();
  const token = cookieStore.get(ACCESS_COOKIE)?.value;

  if (!secret || !(await verifySessionToken(token, secret))) redirect("/login");

  return <WordBook />;
}
