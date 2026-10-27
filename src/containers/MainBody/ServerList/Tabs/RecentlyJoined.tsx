import { useEffect, useMemo } from "react";
import { useQuery } from "../../../../hooks/query";
import { useGenericTempState } from "../../../../states/genericStates";
import { usePersistentServers, useServers } from "../../../../states/servers";
import { sortAndSearchInServerList } from "../../../../utils/helpers";
import { Server } from "../../../../utils/types";
import List from "../List";
import ServerItem from "./../Item";

const RecentlyJoined = () => {
  const { startQuery, stopQuery } = useQuery();
  const { selected, setSelected } = useServers();
  const { recentlyJoined } = usePersistentServers();
  const { searchData } = useGenericTempState();

  useEffect(() => {
    return () => {
      stopQuery();
      setSelected(undefined);
    };
  }, []);

  const list = useMemo(() => {
    const { sortPing, sortPlayer, sortName, sortMode, sortLock } = searchData;
    let list = sortAndSearchInServerList(recentlyJoined, searchData);

    const noSortingApplied =
      sortPlayer === "none" &&
      sortPing === "none" &&
      sortName === "none" &&
      sortMode === "none" &&
      sortLock === "none";

    return noSortingApplied ? list.reverse() : list;
  }, [recentlyJoined, searchData]);

  // Selecting the already-selected server again clears the selection (row
  // re-click and Esc both go through here).
  const onSelect = (server: Server) => {
    stopQuery();
    if (selected && selected.ip === server.ip && selected.port === server.port) {
      setSelected(undefined);
      return;
    }
    setSelected(server);
    startQuery(server, "recentlyjoined");
  };

  return (
    <List
      data={list}
      onSelect={onSelect}
      renderItem={(item, index) => (
        <ServerItem
          isSelected={
            selected
              ? selected.ip === item.ip && selected.port === item.port
              : false
          }
          server={item}
          index={index}
          onSelect={(server) => onSelect(server)}
        />
      )}
    />
  );
};

export default RecentlyJoined;
