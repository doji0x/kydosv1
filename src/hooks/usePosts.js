import { useCallback, useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";

// Live list of posts matching a filter. `key` re-runs the query when it changes.
export function usePosts(query, key) {
  const [posts, setPosts] = useState(null);
  const load = useCallback(
    () => base44.entities.Post.filter(query, "-created_date", 200).then(setPosts),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [key]
  );
  useEffect(() => {
    load();
    return base44.entities.Post.subscribe(load);
  }, [load]);
  return [posts, load];
}