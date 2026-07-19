import SharedLoading from "@/components/loading";

export default function Loading() {
  return (
    <div className="flex min-h-screen w-full items-center justify-center">
      <SharedLoading fullScreen />
    </div>
  );
}
