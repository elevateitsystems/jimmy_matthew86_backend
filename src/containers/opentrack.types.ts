export type OpenTrackLocation = {
  name?: string;
};

export type OpenTrackHistoryEvent = {
  milestone?: string;
  timestamp?: string;
  location?: OpenTrackLocation;
};

export type OpenTrackContainer = {
  containerId?: string;
  masterBillNumber?: string;
  scacCode?: string;
  steamshipLine?: string;
  status?: string;
  containerSize?: string;
  containerType?: string;
  equipmentType?: string;
  vesselName?: string;
  vessel?: { name?: string };
  voyageNumber?: string;
  originPort?: OpenTrackLocation;
  destinationPort?: OpenTrackLocation;
  terminalAtDestinationPort?: { name?: string };
  portOfLoading?: string;
  portOfDischarge?: string;
  terminalAtPortOfDischarge?: string;
  lastFreeDay?: string;
  detentionLastFreeDay?: string;
  dischargedDate?: string;
  outgatedDate?: string;
  emptyReturnedDate?: string;
  etaAtTerminal?: string;
  etdFromOrigin?: string;
  history?: OpenTrackHistoryEvent[];
};

export type OpenTrackListResponse = {
  data?: OpenTrackContainer[];
  total?: number;
};
