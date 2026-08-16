"use client";

import dynamic from "next/dynamic";

const Viewfinder = dynamic(() => import("./Viewfinder"), { ssr: false });

export default function DynamicViewfinder() {
  return <Viewfinder />;
}
