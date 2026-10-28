import {describe,expect,it} from 'vitest';
import {workTimeText,workSummaryText} from './workText';
import {initialCoast} from './model';
describe('quiet work duration and earned total',()=>{
 it('shows minutes and seconds without exposing fractional ticks',()=>{expect(workTimeText(0)).toBe('00:00');expect(workTimeText(59_999)).toBe('00:59');expect(workTimeText(754_500)).toBe('12:34');});
 it('keeps total hours visible for a long work session',()=>{expect(workTimeText(3_600_000)).toBe('1:00:00');expect(workTimeText(25*3_600_000+61_000)).toBe('25:01:01');});
 it('displays the current job gain instead of unsold stock or its last single batch',()=>{expect(workSummaryText({...initialCoast(),activity:'fish',catches:12,fish:0,workTimeMs:3_600_000,workAmount:12})).toBe('낚시 1:00:00 · 물고기 +12');});
});
