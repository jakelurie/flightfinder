import { expect, it } from 'vitest';
import { diverseCandidates } from '../discovery';
it('keeps the top pick while making room for other regions and countries',()=>{
 const rows=[{country:'Japan',region:'Asia'},{country:'Japan',region:'Asia'},{country:'Japan',region:'Asia'},{country:'Spain',region:'Europe'},{country:'Mexico',region:'America'},{country:'Korea',region:'Asia'}];
 const chosen=diverseCandidates(rows,4);
 expect(chosen).toEqual([rows[0],rows[3],rows[4],rows[5]]);
 expect(diverseCandidates(rows,0)).toEqual([]);
 expect(diverseCandidates(rows,10)).toHaveLength(5);
});
it('does not treat every unknown country as the same country',()=>{
 expect(diverseCandidates([{country:''},{country:''},{country:''}],3)).toHaveLength(3);
});
