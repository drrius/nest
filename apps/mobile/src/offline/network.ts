import * as Network from "expo-network";
import { connectivityHub } from "./connectivity-hub";
export const onNetwork = connectivityHub(Network.addNetworkStateListener);
export const networkState = Network.getNetworkStateAsync;
