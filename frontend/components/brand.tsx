import Link from "next/link";

export function Brand({ small = false }: { small?: boolean }) {
  return <Link href="/" aria-label="LunaWindow home" className={small ? "brand brand-small" : "brand"}>
    <span className="brand-mark" aria-hidden />
    <span>LUNA<span className="brand-light">WINDOW</span></span>
  </Link>;
}
