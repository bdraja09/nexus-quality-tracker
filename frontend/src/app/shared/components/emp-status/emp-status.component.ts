import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatTableModule } from '@angular/material/table';

export interface Employee {
  image: string;
  name: string;
  email: string;
  qualification: string;
  status: string;
  statusClass: string;
}

@Component({
    selector: 'app-emp-status',
    imports: [MatCardModule, MatButtonModule, MatTableModule, CommonModule],
    templateUrl: './emp-status.component.html',
    styleUrl: './emp-status.component.scss'
})
export class EmpStatusComponent {
  empDisplayedColumns: string[] = ['name', 'status'];
  empDataSource: Employee[] = [
    {
      image: 'assets/images/user/user5.jpg',
      name: 'Mr. Jay Soni',
      email: 'jay.soni@gmail.com',
      qualification: 'Manager',
      status: 'Available',
      statusClass: 'badge badge-solid-green',
    },
    {
      image: 'assets/images/user/user6.jpg',
      name: 'Ms. Sarah Smith',
      email: 'sarah.smith@gmail.com',
      qualification: 'Developer',
      status: 'Absent',
      statusClass: 'badge badge-solid-orange',
    },
    {
      image: 'assets/images/user/user3.jpg',
      name: 'Ms. Megha Trivedi',
      email: 'megha.trivedi@gmail.com',
      qualification: 'Tester',
      status: 'Available',
      statusClass: 'badge badge-solid-green',
    },
    {
      image: 'assets/images/user/user2.jpg',
      name: 'Mr. John Deo',
      email: 'john.deo@gmail.com',
      qualification: 'Designer',
      status: 'Available',
      statusClass: 'badge badge-solid-green',
    },
    {
      image: 'assets/images/user/user1.jpg',
      name: 'Mr. Jacob Ryan',
      email: 'jacob.ryan@gmail.com',
      qualification: 'Developer',
      status: 'Absent',
      statusClass: 'badge badge-solid-orange',
    },
    {
      image: 'assets/images/user/user8.jpg',
      name: 'Mr. Jay Soni',
      email: 'jay.soni@gmail.com',
      qualification: 'Team Leader',
      status: 'Available',
      statusClass: 'badge badge-solid-green',
    },
    {
      image: 'assets/images/user/user9.jpg',
      name: 'Ms. Linda Carter',
      email: 'linda.carter@gmail.com',
      qualification: 'Director',
      status: 'Available',
      statusClass: 'badge badge-solid-green',
    },
    {
      image: 'assets/images/user/user10.jpg',
      name: 'Mr. Rajesh Kumar',
      email: 'rajesh.kumar@gmail.com',
      qualification: 'Tester',
      status: 'Absent',
      statusClass: 'badge badge-solid-orange',
    },
    {
      image: 'assets/images/user/user11.jpg',
      name: 'Ms. Nina Patel',
      email: 'nina.patel@gmail.com',
      qualification: 'Developer',
      status: 'Available',
      statusClass: 'badge badge-solid-green',
    },
    {
      image: 'assets/images/user/user1.jpg',
      name: 'Mr. Michael Lee',
      email: 'michael.lee@gmail.com',
      qualification: 'Designer',
      status: 'Available',
      statusClass: 'badge badge-solid-green',
    },
  ];
}
