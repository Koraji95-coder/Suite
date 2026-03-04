import {
	ChevronFirstIcon,
	ChevronLastIcon,
	ChevronLeftIcon,
	ChevronRightIcon,
} from "lucide-react";
import { useId } from "react";

import {
	Pagination,
	PaginationContent,
	PaginationItem,
	PaginationLink,
} from "@/components/apps/ui/pagination";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/apps/ui/select";
import { Label } from "@/components/primitives/Text";
import styles from "./file-manager-app-pagination.module.css";

type PaginationProps = {
	currentPage?: number;
	totalPages?: number;
};

export default function FileManagerPagination({
	currentPage = 1,
	totalPages = 1,
}: PaginationProps) {
	const id = useId();
	return (
		<div className={styles.root}>
			{/* Results per page */}
			<div className={styles.rowsPerPage}>
				<Label className={styles.rowsLabel} htmlFor={id}>
					Rows per page
				</Label>
				<Select value="25">
					<SelectTrigger id={id} className={styles.selectTrigger}>
						<SelectValue placeholder="Select number of results" />
					</SelectTrigger>
					<SelectContent className={styles.selectContent}>
						<SelectItem value="10">10</SelectItem>
						<SelectItem value="25">25</SelectItem>
						<SelectItem value="50">50</SelectItem>
						<SelectItem value="100">100</SelectItem>
					</SelectContent>
				</Select>
			</div>

			{/* Page number information */}
			<div className={styles.resultsInfo}>
				<p className={styles.resultsText} aria-live="polite">
					<span className={styles.resultsStrong}>1-25</span> of{" "}
					<span className={styles.resultsStrong}>100</span>
				</p>
			</div>

			{/* Pagination */}
			<div>
				<Pagination>
					<PaginationContent>
						{/* First page button */}
						<PaginationItem>
							<PaginationLink
								className={styles.pageLink}
								href={
									currentPage === 1 ? undefined : `#/page/${currentPage - 1}`
								}
								aria-label="Go to first page"
								aria-disabled={currentPage === 1 ? true : undefined}
								role={currentPage === 1 ? "link" : undefined}
							>
								<ChevronFirstIcon size={16} aria-hidden="true" />
							</PaginationLink>
						</PaginationItem>

						{/* Previous page button */}
						<PaginationItem>
							<PaginationLink
								className={styles.pageLink}
								href={
									currentPage === 1 ? undefined : `#/page/${currentPage - 1}`
								}
								aria-label="Go to previous page"
								aria-disabled={currentPage === 1 ? true : undefined}
								role={currentPage === 1 ? "link" : undefined}
							>
								<ChevronLeftIcon size={16} aria-hidden="true" />
							</PaginationLink>
						</PaginationItem>

						{/* Next page button */}
						<PaginationItem>
							<PaginationLink
								className={styles.pageLink}
								href={
									currentPage === totalPages
										? undefined
										: `#/page/${currentPage + 1}`
								}
								aria-label="Go to next page"
								aria-disabled={currentPage === totalPages ? true : undefined}
								role={currentPage === totalPages ? "link" : undefined}
							>
								<ChevronRightIcon size={16} aria-hidden="true" />
							</PaginationLink>
						</PaginationItem>

						{/* Last page button */}
						<PaginationItem>
							<PaginationLink
								className={styles.pageLink}
								href={
									currentPage === totalPages
										? undefined
										: `#/page/${totalPages}`
								}
								aria-label="Go to last page"
								aria-disabled={currentPage === totalPages ? true : undefined}
								role={currentPage === totalPages ? "link" : undefined}
							>
								<ChevronLastIcon size={16} aria-hidden="true" />
							</PaginationLink>
						</PaginationItem>
					</PaginationContent>
				</Pagination>
			</div>
		</div>
	);
}
