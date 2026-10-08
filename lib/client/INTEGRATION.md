# Client v2 integration interface (Stage A)
Root owns engine, HTTP transport, profiles, route, UI, and shared live files. Agents only edit assigned modules/tests.

miami.mjs: export resolveMiami(input,get) and enrichMiami(raw,parcelId).
- input {address,ownerName,county,unit?}; get(url,id,headers={},options={method,body,binary}).
- resolve returns {status:'MATCHED'|'OWNER_MISMATCH'|'OWNER_UNAVAILABLE'|'AMBIGUOUS'|'NOT_FOUND'|'SEARCH_INCOMPLETE', parcel_id?, candidates:[], raw?, source_id?, notes:[]}.
- enrich returns client PascalCase sections {PropertyInformation,AssessmentInformation,AssessmentHistory,BenefitsInformation,BenefitsNote,TaxableValueInformation,FullLegalDescription,SalesInformation,LandBuildingExtraFeatures}, plus section_status and provenance and notes. Keep source zero/null/sentinels distinct. Export pure matching helpers for tests.

bill.mjs: export parseClientBillPdf(bytes,expectedId,expectedYear) and parseClientTaxHistory(html).
- bill returns client sections {BillDetails,AdValoremMillage,AdValoremGroupTotals,NonAdValorem,NonAdValoremNote,Exemptions,ExemptionsNote,ParcelDetails,TaxAmounts,PaymentDetails}, plus section_status/provenance/validation/notes.
- history returns {summary:{accountNumber,amountDue,statusMessage,lastPaymentDate,lastPaymentAmount},history:[{billYear,billType,amountDue,status,paidAmount,paidDate,receiptNumber,billId,pdf_url?,certificate?,taxDeed?,note}], unavailableYears:[], coverage:'COMPLETE'|'PARTIAL'|'UNAVAILABLE'}; retain raw notes and closed events.

contract.mjs: validateClientInput(input) normalizes registry county ID and required order/address/owner/transaction.
serializeClientRecord(order,{match,sections,section_status,sources,errors,validation,provenance,delinquency,request_id,collected_at,duration_ms}) returns client envelope, all mandatory sample keys, ExtractionMetadata.
- match shape above. Preserve nested status:new, transaction and echoed order. Section notes distinguish missing versus inspected empty. ownerOccupied nullable. Canonical sample nesting.

delinquency.mjs: classifyDelinquency({history,unavailableYears,coverage,asOf,county,timeZone,deadline?}) returns DelinquencyInformation with nullable hasActiveDelinquency; knownPriorYearsDue, totalPriorYearsDue, currentYearDue; coverage/unavailableYears; no duplicate liabilities or face-value sums.
Money displayed strings externally; deterministic decimal operations internally. No paid calls or live saved-data fallback in any agent code. No agent edits existing live modules.
