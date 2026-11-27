import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import type { Locale } from '@/lib/alsvid-api';
import { DealerCenter } from '@/components/dealer-center';
export const metadata:Metadata={title:'ALSVID Dealer Center',robots:{index:false,follow:false}};
export default async function DealerCenterPage({params}:{params:Promise<{locale:string}>}){
 const {locale}=await params;if(!['de','en','zh'].includes(locale))notFound();
 return <DealerCenter locale={locale as Locale}/>;
}
