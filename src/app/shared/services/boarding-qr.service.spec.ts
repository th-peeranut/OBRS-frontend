import { of, throwError } from 'rxjs';
import QRCode from 'qrcode';
import { BoardingQrService } from './boarding-qr.service';
import { TicketService } from '../../services/ticket/ticket.service';

function successResponse(ticketId: number, boardingToken: string) {
  return of({
    code: 200,
    message: 'OK',
    data: { ticketId, ticketNumber: `T-${ticketId}`, boardingToken, expiresAt: '' },
  });
}

describe('BoardingQrService (OBRS-221 shared boarding-token QR pipeline)', () => {
  let ticketServiceStub: jasmine.SpyObj<TicketService>;
  let service: BoardingQrService;

  beforeEach(() => {
    ticketServiceStub = jasmine.createSpyObj<TicketService>('TicketService', [
      'getBoardingToken',
    ]);
    service = new BoardingQrService(ticketServiceStub);
  });

  it('should create', () => {
    expect(service).toBeTruthy();
  });

  it('getState returns undefined before any fetch has resolved', () => {
    expect(service.getState(1)).toBeUndefined();
  });

  describe('QR rendering params', () => {
    it('renders the QR with width:140, margin:1, errorCorrectionLevel:"M"', async () => {
      const qrSpy = spyOn(QRCode, 'toDataURL').and.callThrough() as unknown as jasmine.Spy;
      ticketServiceStub.getBoardingToken.and.returnValue(
        successResponse(1, 'the-token') as never
      );

      service.fetchBoardingTokens([1], () => undefined);
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(qrSpy).toHaveBeenCalledWith(
        'the-token',
        jasmine.objectContaining({ width: 140, margin: 1, errorCorrectionLevel: 'M' })
      );
      expect(service.getState(1)?.qrDataUrl).toContain('data:image');
      expect(service.getState(1)?.qrUnavailable).toBeFalse();
    });
  });

  describe('dedupe guard', () => {
    it('does not re-issue the GET for a ticketId already fetched/in-flight', () => {
      ticketServiceStub.getBoardingToken.and.returnValue(successResponse(1, 'tok') as never);

      service.fetchBoardingTokens([1], () => undefined);
      service.fetchBoardingTokens([1], () => undefined);

      expect(ticketServiceStub.getBoardingToken).toHaveBeenCalledTimes(1);
    });

    it('does not invoke onUpdated (no-op) when every requested ticketId is already fetched', () => {
      ticketServiceStub.getBoardingToken.and.returnValue(successResponse(1, 'tok') as never);
      service.fetchBoardingTokens([1], () => undefined);

      const onUpdated = jasmine.createSpy('onUpdated');
      service.fetchBoardingTokens([1], onUpdated);

      expect(onUpdated).not.toHaveBeenCalled();
    });

    it('still fetches a new ticketId mixed in with an already-fetched one', () => {
      ticketServiceStub.getBoardingToken.and.callFake(
        (ticketId: number) => successResponse(ticketId, `tok-${ticketId}`) as never
      );

      service.fetchBoardingTokens([1], () => undefined);
      service.fetchBoardingTokens([1, 2], () => undefined);

      expect(ticketServiceStub.getBoardingToken).toHaveBeenCalledTimes(2);
    });

    it('ignores null ticketIds', () => {
      service.fetchBoardingTokens([null, null], () => undefined);

      expect(ticketServiceStub.getBoardingToken).not.toHaveBeenCalled();
    });
  });

  describe('per-ticket catchError isolation', () => {
    it('one ticket 409 TICKET_NOT_CONFIRMED among several does not abort the others', async () => {
      ticketServiceStub.getBoardingToken.and.callFake((ticketId: number) =>
        ticketId === 2
          ? (throwError(() => ({ error: { errorCode: 'TICKET_NOT_CONFIRMED' } })) as never)
          : (successResponse(ticketId, `tok-${ticketId}`) as never)
      );

      const onUpdated = jasmine.createSpy('onUpdated');
      service.fetchBoardingTokens([1, 2, 3], onUpdated);
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(onUpdated).toHaveBeenCalled();
      expect(service.getState(1)?.qrUnavailable).toBeFalse();
      expect(service.getState(1)?.qrDataUrl).toContain('data:image');
      expect(service.getState(2)?.qrUnavailable).toBeTrue();
      expect(service.getState(2)?.qrDataUrl).toBe('');
      expect(service.getState(3)?.qrUnavailable).toBeFalse();
      expect(service.getState(3)?.qrDataUrl).toContain('data:image');
    });

    it('an empty boardingToken in a 200 response also renders as qrUnavailable', async () => {
      ticketServiceStub.getBoardingToken.and.returnValue(successResponse(1, '') as never);

      service.fetchBoardingTokens([1], () => undefined);
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(service.getState(1)?.qrUnavailable).toBeTrue();
      expect(service.getState(1)?.qrDataUrl).toBe('');
    });
  });

  describe('onUpdated timing', () => {
    it('fires onUpdated synchronously when no pending ticket has a token to render (mirrors the pre-extraction component behavior)', () => {
      ticketServiceStub.getBoardingToken.and.returnValue(successResponse(1, '') as never);
      const onUpdated = jasmine.createSpy('onUpdated');

      service.fetchBoardingTokens([1], onUpdated);

      expect(onUpdated).toHaveBeenCalled();
      expect(service.getState(1)?.qrUnavailable).toBeTrue();
    });
  });

  describe('skipGlobalLoadingAlert passthrough', () => {
    it('omits the second arg to TicketService.getBoardingToken by default (e-ticket call shape)', () => {
      ticketServiceStub.getBoardingToken.and.returnValue(successResponse(1, 'tok') as never);

      service.fetchBoardingTokens([1], () => undefined);

      expect(ticketServiceStub.getBoardingToken).toHaveBeenCalledOnceWith(1);
    });

    it('passes skipGlobalLoadingAlert:true through explicitly when the caller opts in (sell-receipt call shape)', () => {
      ticketServiceStub.getBoardingToken.and.returnValue(successResponse(1, 'tok') as never);

      service.fetchBoardingTokens([1], () => undefined, true);

      expect(ticketServiceStub.getBoardingToken).toHaveBeenCalledOnceWith(1, true);
    });
  });
});
