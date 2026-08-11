import { redirect } from "next/navigation";

/**
 * The desktop pet is now the primary task surface. Keep this route as a
 * compatibility redirect so old bookmarks and legacy task links do not open
 * a second, obsolete dashboard.
 */
export default function RetiredDeskPage() {
  redirect("/work");
}
