/** Feature pills under a story beat; near-black text for contrast (sage is for labels). */
export function StoryChips({ tags }: { tags: string[] }) {
  return (
    <div className="mt-6 flex flex-wrap justify-center gap-2">
      {tags.map(tag => (
        <span
          key={tag}
          className="mk-small rounded-full border border-sage/40 bg-sage/14 px-[14px] py-1.5 font-semibold whitespace-nowrap text-ink"
        >
          {tag}
        </span>
      ))}
    </div>
  )
}
