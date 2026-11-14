import Link from "next/link";

export function Brand({ small = false }: { small?: boolean }) {
  return <Link href="/" aria-label="MoonSight home" className={small ? "brand brand-small" : "brand"}>
    {/* The vector wordmark preserves the orbit and lettering in the supplied logo. */}
    {/* eslint-disable-next-line @next/next/no-img-element */}
    <img src="/media/moonsight-wordmark.svg" width={1000} height={313} alt="" />
  </Link>;
}
