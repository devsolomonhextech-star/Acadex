import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type PropsWithChildren,
} from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client";
import type { Child } from "../types/models";

type ChildContextValue = {
  children: Child[];
  selectedChild: Child | null;
  selectedChildId: string | null;
  selectChild: (id: string) => void;
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;
};
const ChildContext = createContext<ChildContextValue | null>(null);
export function ParentDataProvider({ children: content }: PropsWithChildren) {
  const client = useQueryClient();
  const {
    data = [],
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ["family", "children"],
    queryFn: async () => (await api.get<Child[]>("/family/children")).data,
  });
  const [selectedChildId, setSelectedChildId] = useState<string | null>(null);
  const selectedChild =
    data.find((child) => child.id === selectedChildId) ?? data[0] ?? null;
  const selectChild = useCallback(
    (id: string) => {
      const previous = selectedChild?.id;
      if (previous && previous !== id)
        client.removeQueries({
          predicate: (query) => query.queryKey.includes(previous),
        });
      setSelectedChildId(id);
    },
    [client, selectedChild?.id],
  );
  const value = useMemo(
    () => ({
      children: data,
      selectedChild,
      selectedChildId: selectedChild?.id ?? null,
      selectChild,
      isLoading,
      error: error as Error | null,
      refetch: () => {
        void refetch();
      },
    }),
    [data, selectedChild, selectChild, isLoading, error, refetch],
  );
  return <ChildContext.Provider value={value}>{content}</ChildContext.Provider>;
}
export function useChildren() {
  const value = useContext(ChildContext);
  if (!value) throw new Error("useChildren requires ParentDataProvider");
  return value;
}
