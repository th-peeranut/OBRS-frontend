import { ParcelMeDto } from '../../../shared/interfaces/parcel.interface';

export interface MyParcelsState {
  items: ParcelMeDto[];
  page: number;
  hasMore: boolean;
  loading: boolean;
  loaded: boolean;
  error: string | null;
}

export const initialMyParcelsState: MyParcelsState = {
  items: [],
  page: 0,
  hasMore: false,
  loading: false,
  loaded: false,
  error: null,
};
