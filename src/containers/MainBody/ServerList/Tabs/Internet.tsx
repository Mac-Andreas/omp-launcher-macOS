import { useEffect, useMemo } from "react";
import { useQuery } from "../../../../hooks/query";
import { useGenericTempState } from "../../../../states/genericStates";
import { useServers } from "../../../../states/servers";
import { sortAndSearchInServerList } from "../../../../utils/helpers";
import { Server } from "../../../../utils/types";
import List from "../List";
import ServerItem from "./../Item";

const Internet = () => {
  const { startQuery, stopQuery } = useQuery();
  const { selected, servers, setSelected } = useServers();
  const { searchData } = useGenericTempState();

  useEffect(() => {
    return () => {
      stopQuery();
      setSelected(undefined);
    };
  }, []);

  const list = useMemo(() => {
    return sortAndSearchInServerList(servers, searchData);
  }, [servers, searchData]);

  // Selecting the already-selected server again clears the selection (row
  // re-click and Esc both go through here).
  const onSelect = (server: Server) => {
    stopQuery();
    if (selected && selected.ip === server.ip && selected.port === server.port) {
      setSelected(undefined);
      return;
    }
    setSelected(server);
    startQuery(server, "internet");
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

export default Internet;
