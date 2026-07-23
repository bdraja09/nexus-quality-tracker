import { Component, OnInit } from '@angular/core';
import { Router, ActivatedRoute, RouterLink } from '@angular/router';
import { UntypedFormBuilder, UntypedFormGroup, Validators, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { AuthService, Role } from '@core';
import { UnsubscribeOnDestroyAdapter } from '@shared';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatButtonModule } from '@angular/material/button';

@Component({
    selector: 'app-signin',
    templateUrl: './signin.component.html',
    styleUrls: ['./signin.component.scss'],
    imports: [
        RouterLink,
        MatButtonModule,
        FormsModule,
        ReactiveFormsModule,
        MatFormFieldModule,
        MatInputModule,
        MatIconModule,
    ]
})
export class SigninComponent
  extends UnsubscribeOnDestroyAdapter
  implements OnInit
{
  authForm!: UntypedFormGroup;
  submitted = false;
  loading = false;
  error = '';
  hide = true;

  constructor(
    private formBuilder: UntypedFormBuilder,
    private route: ActivatedRoute,
    private router: Router,
    private authService: AuthService
  ) {
    super();
  }

  ngOnInit() {
    this.authForm = this.formBuilder.group({
      username: ['manager@nexus.com', Validators.required],
      password: ['password123', Validators.required],
    });
  }

  get f() {
    return this.authForm.controls;
  }

  managerSet() {
    this.authForm.get('username')?.setValue('manager@nexus.com');
    this.authForm.get('password')?.setValue('password123');
  }
  operatorSet() {
    this.authForm.get('username')?.setValue('operator@nexus.com');
    this.authForm.get('password')?.setValue('password123');
  }
  auditorSet() {
    this.authForm.get('username')?.setValue('auditor@nexus.com');
    this.authForm.get('password')?.setValue('password123');
  }

  onSubmit() {
    this.submitted = true;
    this.loading = true;
    this.error = '';
    if (this.authForm.invalid) {
      this.error = 'Username and Password not valid !';
      return;
    } else {
      this.subs.sink = this.authService
        .login(this.f['username'].value, this.f['password'].value)
        .subscribe(
          (res) => {
            if (res) {
              setTimeout(() => {
  const role = this.authService.currentUserValue.role;
  console.log('DEBUG role:', JSON.stringify(role));
  console.log('DEBUG Role.Manager:', JSON.stringify(Role.Manager));
  console.log('DEBUG match:', role === Role.Manager);
  if (role === Role.Manager || role === Role.Operator || role === Role.Auditor || role === Role.All) {
    console.log('DEBUG entre dans le if, tentative navigate');
    this.router.navigate(['/admin/quality/dashboard']).then(success => {
      console.log('DEBUG navigation success:', success);
    }).catch(err => {
      console.log('DEBUG navigation ERROR:', err);
    });
  } else {
    console.log('DEBUG tombe dans le ELSE');
    this.router.navigate(['/authentication/signin']);
  }
  this.loading = false;
}, 1000);
            }
          },
          (error) => {
            this.error = error;
            this.loading = false;
          }
        );
    }     
  }
}