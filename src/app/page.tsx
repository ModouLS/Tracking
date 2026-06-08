import { redirect } from "next/navigation";

/** Landing → the public tracking page is the primary entry point. */
export default function Home() {
  redirect("/track");
}
