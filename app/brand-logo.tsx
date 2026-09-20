import Image from "next/image";

type BrandLogoProps = {
  variant: "auth" | "sidebar";
};

/** The product mark is intentionally separate from organization/location logos. */
export function BrandLogo({ variant }: BrandLogoProps) {
  return (
    <Image
      className={`brand-logo brand-logo-${variant}`}
      src={variant === "sidebar" ? "/brand/understack-shift-logo-sidebar.png" : "/brand/understack-shift-logo-v1.png"}
      alt="UnderStack Shift"
      width={1086}
      height={362}
      priority
    />
  );
}
